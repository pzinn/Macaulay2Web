# syntax=docker/dockerfile:1.7
# fedora + Macaulay2
FROM registry.fedoraproject.org/fedora-minimal:43
LABEL org.opencontainers.image.authors="Paul Zinn-Justin <pzinn@unimelb.edu.au>"
RUN microdnf -y --setopt=install_weak_deps=0 install sudo wget tar openssh openssl openssh-server graphviz lapack cddlib gc glpk gmp-c++ openblas-serial openblas-threads libnauty libatomic_ops givaro mathic mathicgb-libs memtailor boost-stacktrace boost-regex procps mpfr normaliz gfan which flexiblas-netlib ntl mpfi libffi nauty csdp csdp-tools factory mpsolve 4ti2 TOPCOM scip python3-matplotlib jansson && microdnf clean all
# have to manually do this cause no systemd
RUN ssh-keygen -t rsa -f /etc/ssh/ssh_host_rsa_key -N ''

# Macaulay2 - provide manually the rpm
ARG MACAULAY2_RPM=Macaulay2.rpm
RUN --mount=type=bind,source=${MACAULAY2_RPM},target=/tmp/Macaulay2.rpm \
    rpm -i /tmp/Macaulay2.rpm

# M2 userland, part 1.    
RUN useradd -m -d /home/m2user m2user
RUN mkdir /custom
RUN chown -R m2user:m2user /custom
RUN chmod -R 775 /custom

# PHCpack
RUN cd /custom && \
    wget https://github.com/janverschelde/PHCpack/releases/download/v2.4.92/x86_64phc && \
    chmod 755 /custom/x86_64phc && \
    ln -s /custom/x86_64phc /usr/bin/phc

# Bertini
# This is the only way extracting Bertini gives the right permissions.
ENV BERTINI_VERSION=1.7
RUN su m2user -c "/bin/bash;\
   cd /custom;\
   wget https://bertini.nd.edu/BertiniLinux64_v${BERTINI_VERSION}.tar.gz;\
   tar xzf BertiniLinux64_v${BERTINI_VERSION}.tar.gz;\
   rm BertiniLinux64_v${BERTINI_VERSION}.tar.gz;"
RUN ln -s /custom/BertiniLinux64_v${BERTINI_VERSION}/bertini /usr/bin/

# surf binary TODO better
# COPY surf /usr/bin

# disabled for security reasons: let user modify M2 code
# RUN chown -R m2user:m2user /usr/share/Macaulay2

# additional security measures
RUN chmod 700 /var
